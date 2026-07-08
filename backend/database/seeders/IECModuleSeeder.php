<?php
// database/seeders/IECModuleSeeder.php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\IECModule;
use App\Models\IECVideo;
use App\Models\IECRiskAlert;
use App\Models\IECInfographic;

class IECModuleSeeder extends Seeder
{
    public function run()
    {
        $months = [
            1 => [
                'trimester' => '1st Trimester',
                'title' => 'Conception & New Beginnings',
                'week_range' => 'Weeks 1-4',
                'baby_development' => 'Conception occurs, and the fertilized egg travels to the uterus. Cell division begins rapidly, forming an embryo. By week 4, the foundation of the heart, nervous system, and organs are starting to take shape.',
                'mother_changes' => 'You might not look pregnant yet, but internally your hormone levels (hCG, progesterone) are spiking. You may begin experiencing breast tenderness, subtle nausea, and increased fatigue.',
                'expected_symptoms' => 'Frequent urination, light fatigue, breast sensitivity, mild cramps or bloating.',
                'nutritional_guidance' => 'Start taking 400-800 mcg of Folic Acid daily. Include folate-rich foods like spinach, broccoli, fortified cereals, citrus fruits, and legumes.',
                'daily_intake' => ['folic_acid' => '400-800mcg', 'iron' => '27mg']
            ],
            2 => [
                'trimester' => '1st Trimester',
                'title' => 'The Tiny Heart Beats',
                'week_range' => 'Weeks 5-8',
                'baby_development' => "Baby's heart starts beating! Limb buds appear, and the brain begins developing rapidly.",
                'mother_changes' => 'Morning sickness may peak. Breasts continue to grow and become more tender.',
                'expected_symptoms' => 'Nausea, food aversions, mood swings, increased urination.',
                'nutritional_guidance' => 'Continue folic acid. Add vitamin B6 to help with nausea. Stay hydrated.',
                'daily_intake' => ['folic_acid' => '400-800mcg', 'vitamin_b6' => '25mg', 'water' => '2.5L']
            ],
            3 => [
                'trimester' => '1st Trimester',
                'title' => 'First Trimester Milestones',
                'week_range' => 'Weeks 9-12',
                'baby_development' => 'Major organs continue forming, fingers and toes are visible, and the baby begins small movements.',
                'mother_changes' => 'Nausea and fatigue may still be present, while the uterus starts to grow above the pelvis.',
                'expected_symptoms' => 'Morning sickness, tender breasts, mild headaches, and emotional changes.',
                'nutritional_guidance' => 'Eat small frequent meals with protein, whole grains, fruits, and vegetables. Avoid alcohol, smoking, and unsafe medications.',
                'daily_intake' => ['folic_acid' => '400-800mcg', 'iron' => '27mg', 'water' => '2.5L']
            ],
            4 => [
                'trimester' => '2nd Trimester',
                'title' => 'Energy Returns',
                'week_range' => 'Weeks 13-16',
                'baby_development' => 'Facial features become clearer, bones strengthen, and the baby may begin coordinated movements.',
                'mother_changes' => 'Energy often improves and nausea may lessen. The abdomen may start to show.',
                'expected_symptoms' => 'Round ligament discomfort, increased appetite, and mild nasal congestion.',
                'nutritional_guidance' => 'Increase calcium-rich foods such as milk, yogurt, sardines, tofu, and leafy greens.',
                'daily_intake' => ['calcium' => '1000mg', 'iron' => '27mg', 'water' => '2.5-3L']
            ],
            5 => [
                'trimester' => '2nd Trimester',
                'title' => 'Feeling Baby Move',
                'week_range' => 'Weeks 17-20',
                'baby_development' => 'The baby grows rapidly, develops hearing, and many mothers begin feeling movement.',
                'mother_changes' => 'Weight gain becomes more noticeable. Back discomfort and leg cramps may start.',
                'expected_symptoms' => 'Quickening, mild swelling, backache, and skin stretching.',
                'nutritional_guidance' => 'Prioritize iron-rich foods with vitamin C sources to reduce anemia risk.',
                'daily_intake' => ['iron' => '27mg', 'vitamin_c' => '85mg', 'water' => '3L']
            ],
            6 => [
                'trimester' => '2nd Trimester',
                'title' => 'Growth And Screening',
                'week_range' => 'Weeks 21-24',
                'baby_development' => 'The baby gains weight, develops sleep cycles, and lungs continue maturing.',
                'mother_changes' => 'The uterus grows higher, and some mothers notice heartburn or constipation.',
                'expected_symptoms' => 'Heartburn, constipation, leg cramps, and mild swelling.',
                'nutritional_guidance' => 'Choose fiber-rich foods, enough fluids, and balanced meals to support steady weight gain.',
                'daily_intake' => ['fiber' => '25-30g', 'calcium' => '1000mg', 'water' => '3L']
            ],
            7 => [
                'trimester' => '3rd Trimester',
                'title' => 'Preparing For The Final Stretch',
                'week_range' => 'Weeks 25-28',
                'baby_development' => 'The baby opens the eyes, responds to sounds, and continues gaining fat.',
                'mother_changes' => 'Breathing may feel harder as the uterus grows. Braxton Hicks contractions can occur.',
                'expected_symptoms' => 'Shortness of breath, sleep discomfort, and occasional tightening of the abdomen.',
                'nutritional_guidance' => 'Continue iron, calcium, and protein. Discuss glucose screening results with your health worker.',
                'daily_intake' => ['protein' => '70g', 'iron' => '27mg', 'water' => '3L']
            ],
            8 => [
                'trimester' => '3rd Trimester',
                'title' => 'Monitoring Baby Position',
                'week_range' => 'Weeks 29-32',
                'baby_development' => 'The baby practices breathing movements and gains more body fat.',
                'mother_changes' => 'Back pain, pelvic pressure, and more frequent urination may increase.',
                'expected_symptoms' => 'Pelvic pressure, swollen feet, sleep difficulty, and frequent urination.',
                'nutritional_guidance' => 'Limit salty processed foods, elevate legs when resting, and maintain regular meals.',
                'daily_intake' => ['calcium' => '1000mg', 'protein' => '70g', 'water' => '3L']
            ],
            9 => [
                'trimester' => '3rd Trimester',
                'title' => 'Birth Readiness',
                'week_range' => 'Weeks 33-36',
                'baby_development' => 'The baby continues gaining weight and may move into a head-down position.',
                'mother_changes' => 'The abdomen feels heavier and clinic visits become more important.',
                'expected_symptoms' => 'More pelvic pressure, Braxton Hicks contractions, and fatigue.',
                'nutritional_guidance' => 'Keep meals balanced and prepare a birth plan with your family and health worker.',
                'daily_intake' => ['iron' => '27mg', 'calcium' => '1000mg', 'water' => '3L']
            ],
            10 => [
                'trimester' => '3rd Trimester',
                'title' => 'Safe Delivery And Newborn Care',
                'week_range' => 'Weeks 37-40',
                'baby_development' => 'The baby is considered full term and continues final weight gain before delivery.',
                'mother_changes' => 'Lightening, stronger contractions, and mucus plug changes may happen as labor approaches.',
                'expected_symptoms' => 'Pelvic pressure, lower back pain, stronger contractions, and increased discharge.',
                'nutritional_guidance' => 'Stay hydrated, eat light balanced meals, and follow your health worker instructions for labor signs.',
                'daily_intake' => ['protein' => '70g', 'iron' => '27mg', 'water' => '3L']
            ],
        ];
        
        foreach ($months as $month => $data) {
            $module = IECModule::updateOrCreate(
                ['month_number' => $month],
                array_merge($data, ['sort_order' => $month, 'is_active' => true])
            );
            
            IECVideo::updateOrCreate(
                [
                    'iec_module_id' => $module->id,
                    'title' => $month === 1
                        ? 'Early Pregnancy And Prenatal Care'
                        : $data['title'] . ' Guide',
                ],
                [
                    'description' => 'Short IEC guide for ' . strtolower($data['week_range']) . '.',
                    'video_url' => 'https://www.youtube.com/embed/demo' . $month,
                    'thumbnail_url' => null,
                    'duration_minutes' => $month === 1 ? 7 : 6,
                    'category' => $month <= 3 ? 'Prenatal Care' : 'Maternal Health',
                    'is_required' => true,
                ]
            );

            IECVideo::updateOrCreate(
                [
                    'iec_module_id' => $module->id,
                    'title' => $data['title'] . ' Nutrition Tips',
                ],
                [
                    'description' => 'Nutrition reminders for this pregnancy stage.',
                    'video_url' => 'https://www.youtube.com/embed/demo' . $month . 'b',
                    'thumbnail_url' => null,
                    'duration_minutes' => 5,
                    'category' => 'Nutrition',
                    'is_required' => true,
                ]
            );

            IECRiskAlert::updateOrCreate(
                [
                    'iec_module_id' => $module->id,
                    'title' => $month <= 3
                        ? 'Heavy Bleeding Or Severe Abdominal Pain'
                        : 'Severe Headache, Swelling, Or Blurred Vision',
                ],
                [
                    'consequence' => $month <= 3
                        ? 'May indicate miscarriage risk, ectopic pregnancy, or another urgent condition.'
                        : 'May indicate high blood pressure or preeclampsia and needs urgent assessment.',
                    'recommendation' => 'Seek immediate care at the nearest Barangay Health Station, RHU, or hospital.',
                    'severity' => 'high',
                ]
            );

            IECInfographic::updateOrCreate(
                [
                    'iec_module_id' => $module->id,
                    'title' => $data['title'] . ' Checklist',
                ],
                [
                    'file_path' => '/infographics/month-' . $month . '-checklist.pdf',
                    'file_size' => '1.2 MB',
                    'format' => 'PDF',
                ]
            );
        }
    }
}
